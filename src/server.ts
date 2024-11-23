import express, { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";
import pg from "pg";
import { assertEnvVar, assertEnvVarNumber } from "./envutils.js";
import { htmlToPlainText } from "./textutils.js";

const idRegExp = /^[0-9]{1,18}$/;

// Load configuration from the environment variables; in real life we would use the secrets manager of the orchestration
// platform (e.g. Docker secrets) to inject secrets onto the filesystem of the container in which the server is running.
const postgresHost = assertEnvVar("POSTGRES_HOST");
const postgresUser = assertEnvVar("POSTGRES_USER");
const postgresPassword = assertEnvVar("POSTGRES_PASSWORD");
const postgresPort = assertEnvVarNumber("POSTGRES_PORT", "5432");
const postgresDb = assertEnvVar("POSTGRES_DB");

// Create database pool
const pool = new pg.Pool({
  host: postgresHost,
  user: postgresUser,
  password: postgresPassword,
  port: postgresPort,
  database: postgresDb,
});

const app = express();

//
// API Version 1
//

const v1 = express.Router();

v1.use(express.json());

// ADDITIONAL THINGS TO DO IF THIS WAS IN PRODUCTION:
// - Support pagination on all GET requests that return multiple records
// - Use prepared statements and materialized views in the database
// - Add logging with tracing (i.e. trace and span IDs)
// - Allow tracing IDs to be propagated via header (e.g. OpenTelemetry's Traceparent header)
// - Authentication layer
// - Caching layer for frequently used endpoints (e.g. user lookups)
// - All handlers would include a try/catch to log any server-side errors and return a generic 500 error.
// - Rejection of requests beyond a reasonable size limit

// Full-text search.
v1.get("/search", async (req: Request, res: Response) => {
  const query = req.query.q;

  if (query == undefined) {
    res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: "Must include query parameter 'q'" });
    return;
  }

  // A more advanced search would also consider titles, comments, etc., would weight the results by the question score,
  // and would use a custom full-text configuration with support for multiple languages. A preview of the full text body
  // is returned, without HTML formatting (the plain-text is used so that we don't accidentantly truncate an HTML tag)
  // while generating the preview).
  const result = await pool.query(
    `SELECT
      questions.id,
      title,
      left(text_body, 256) as preview,
      creation,
      score,
      user_id,
      users.name as user_name
    FROM questions
      INNER JOIN users ON questions.user_id = users.id
    WHERE
      ts_body @@ websearch_to_tsquery('english', $1)
        AND users.deleted = false
    ORDER BY
      ts_rank(ts_body, websearch_to_tsquery('english', $1)) DESC`,
    [query],
  );

  res.json(result.rows);
});

// Create a new question and return its ID.
v1.post("/questions", async (req: Request, res: Response) => {
  if (req.body.title == undefined) {
    res.status(StatusCodes.BAD_REQUEST).json({ error: "title missing" });
    return;
  }

  if (req.body.title.length >= 128) {
    res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: "title cannot exceed 128 characters" });
    return;
  }

  if (req.body.body == undefined) {
    res.status(StatusCodes.BAD_REQUEST).json({ error: "body missing" });
    return;
  }

  // Here is where we would do HTML schema validation on the body, check the body length, etc.

  // In real life, we would lookup the user ID from the authorization header, not have it provided in the post data
  if (req.body.userId == undefined) {
    res.status(StatusCodes.BAD_REQUEST).json({ error: "userId missing" });
    return;
  }

  if (!validateId(req.body.userId, res)) {
    return;
  }

  const result = await pool.query(
    `INSERT INTO questions (
      title,
      html_body,
      text_body,
      creation,
      score,
      user_id)
    VALUES (
      $1,
      $2,
      $3,
      to_timestamp($4),
      $5,
      $6)
    RETURNING id`,
    [
      req.body.title,
      req.body.body,
      htmlToPlainText(req.body.body),
      Date.now() / 1000.0,
      0,
      req.body.userId,
    ],
  );

  res.json(result.rows[0]);
});

// Get all questions. This would definitly be paginated in real life.
v1.get("/questions", async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT
      questions.id,
      title,
      left(text_body, 256) as preview,
      creation,
      score,
      user_id,
      users.name as user_name
    FROM
      questions
        INNER JOIN users ON questions.user_id = users.id
    WHERE
      users.deleted = false
    ORDER BY
      creation`,
  );
  res.json(result.rows);
});

// Get details for a specific question, including the full body text.
v1.get("/questions/:id", async (req: Request, res: Response) => {
  const id = req.params.id;

  if (!validateId(id, res)) {
    return;
  }

  const result = await pool.query(
    `SELECT
      questions.id,
      title,
      html_body as body,
      creation,
      score,
      user_id,
      users.name as user_name
    FROM questions
      INNER JOIN users ON questions.user_id = users.id
    WHERE
      questions.id = $1
        AND users.deleted = false`,
    [id],
  );

  if (result.rowCount == 0) {
    res
      .status(StatusCodes.NOT_FOUND)
      .json({ error: `Question ID ${id} not found` });
    return;
  }

  res.json(result.rows[0]);
});

// Get all comments for a question. This would be paginated in real life.
v1.get("/questions/:id/comments", async (req: Request, res: Response) => {
  const id = req.params.id;

  if (!validateId(id, res)) {
    return;
  }

  // Here we would also want to hit the database to determine if the given question actually exists, and return a 404
  // if it doesn't. Exists queries like that would be great candidates for caching.

  const result = await pool.query(
    `SELECT
      q_comments.id AS id,
      html_body AS body,
      user_id,
      users.name AS user_name
    FROM
      q_comments
        INNER JOIN users on q_comments.user_id = users.id
    WHERE
      question_id = $1
        AND users.deleted = false`,
    [id],
  );

  res.json(result.rows);
});

// Post a comment on a question
v1.post("/questions/:id/comments", async (req: Request, res: Response) => {
  res.status(StatusCodes.NOT_IMPLEMENTED).json({ error: "Not implemented" });
});

// Get all answers for a question. Results are sorted by accepted state and then score. This would be paginated in real
// life.
v1.get("/questions/:id/answers", async (req: Request, res: Response) => {
  const id = req.params.id;

  if (!validateId(id, res)) {
    return;
  }

  // Here we would also want to hit the database to determine if the given question actually exists, and return a 404
  // if it doesn't.

  const result = await pool.query(
    `SELECT
        answers.id,
        left(text_body, 256) as preview,
        creation,
        score,
        user_id,
        users.name AS user_name,
        accepted
      FROM answers
        INNER JOIN users ON answers.user_id = users.id
      WHERE
        question_id = $1
          AND users.deleted = false
      ORDER BY
        accepted DESC,
        score DESC`,
    [id],
  );

  res.json(result.rows);
});

// Post a new answer to a question and return its ID.
v1.post("/questions/:id/answers", async (req: Request, res: Response) => {
  res.status(StatusCodes.NOT_IMPLEMENTED).json({ error: "Not implemented" });
});

// Get all answers. This would be paginated in real life.
v1.get("/answers", async (req: Request, res: Response) => {
  res.status(StatusCodes.NOT_IMPLEMENTED).json({ error: "Not implemented" });
});

// Get details for a specific answer, including the full body text.
v1.get("/answers/:id", async (req: Request, res: Response) => {
  res.status(StatusCodes.NOT_IMPLEMENTED).json({ error: "Not implemented" });
});

// Get all comments for an answer. This would be paginated in real life.
v1.get("/answers/:id/comments", async (req: Request, res: Response) => {
  res.status(StatusCodes.NOT_IMPLEMENTED).json({ error: "Not implemented" });
});

// Get all users. This would be paginated in real life.
v1.get("/users", async (req: Request, res: Response) => {
  const result = await pool.query(
    "SELECT id, name FROM users WHERE deleted=false",
  );
  res.json(result.rows);
});

// Get a single user by user ID
v1.get("/users/:id", async (req: Request, res: Response) => {
  const id = req.params.id;

  if (!validateId(id, res)) {
    return;
  }

  const result = await pool.query(
    "SELECT id, name FROM users WHERE id = $1 AND deleted = false",
    [id],
  );

  if (result.rowCount == 0) {
    res
      .status(StatusCodes.NOT_FOUND)
      .json({ error: `User ID ${id} not found` });
    return;
  }

  res.json(result.rows[0]);
});

app.use("/api/v1", v1);

//
// Start Server
//

const server = app.listen(3000, () => {
  console.log("Server running on port 3000");
});

process.on("SIGINT", () => {
  console.info("SIGINT received; shutting down...");
  server.close();
  pool.end();
});

process.on("SIGTERM", () => {
  console.info("SIGTERM received; shutting down...");
  server.close();
  pool.end();
});

//
// Helper Functions
//

function validateId(id: string, res: Response): boolean {
  if (!idRegExp.test(id)) {
    res
      .status(StatusCodes.BAD_REQUEST)
      .json({ error: `id parameter must be numeric` });
    return false;
  }
  return true;
}
