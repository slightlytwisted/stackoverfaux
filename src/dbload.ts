import pg from "pg";
import { readFileSync } from "node:fs";
import { assertEnvVar, assertEnvVarNumber } from "./envutils.js";
import { htmlToPlainText } from "./textutils.js";

try {
  await run();
  console.log("Done!");
} catch (err) {
  console.error(err);
  process.exit(1);
}

async function run() {
  const postgresHost = assertEnvVar("POSTGRES_HOST");
  const postgresUser = assertEnvVar("POSTGRES_USER");
  const postgresPassword = assertEnvVar("POSTGRES_PASSWORD");
  const postgresPort = assertEnvVarNumber("POSTGRES_PORT", "5432");
  const postgresDb = assertEnvVar("POSTGRES_DB");
  const dbDataFile = assertEnvVar("DB_DATA_FILE");

  // Load the data file into memory; if we were expecting to injest a huge amount of data we would do this in a very
  // different way (e.g. split up the file and distribute the chunks to multiple servers)
  //
  // This would also be a great place to validate the data against a schema.
  console.log(`Reading data file '${dbDataFile}'...`);
  const questions = JSON.parse(readFileSync(dbDataFile, "utf8"));

  console.log("Loading data into database...");
  const client = new pg.Client({
    host: postgresHost,
    user: postgresUser,
    password: postgresPassword,
    port: postgresPort,
    database: postgresDb,
  });
  await client.connect();
  try {
    // We could do this a lot faster by keeping a hashmap of user IDs and only inserting users that we haven't
    // seen before, rather than doing an upsert. Also, I'm assuming here that there are no inconsistencies in the
    // username if the same user ID appears multiple times (e.g. our source data is internally consistent)
    for (const question of questions) {
      await insertUserIfNotExists(client, question.user.id, question.user.name);
      await insertQuestion(
        client,
        question.id,
        question.title,
        question.body,
        question.creation,
        question.score,
        question.user.id,
      );
      for (const qcomment of question.comments) {
        await insertUserIfNotExists(
          client,
          qcomment.user.id,
          qcomment.user.name,
        );
        await insertQuestionComment(
          client,
          qcomment.id,
          question.id,
          qcomment.body,
          qcomment.user.id,
        );
      }
      for (const answer of question.answers) {
        await insertUserIfNotExists(client, answer.user.id, answer.user.name);
        await insertAnswer(
          client,
          answer.id,
          question.id,
          answer.body,
          answer.creation,
          answer.score,
          answer.user.id,
          answer.accepted,
        );
        for (const acomment of answer.comments) {
          await insertUserIfNotExists(
            client,
            acomment.user.id,
            acomment.user.name,
          );
          await insertAnswerComment(
            client,
            acomment.id,
            answer.id,
            acomment.body,
            acomment.user.id,
          );
        }
      }
    }
  } finally {
    await client.end();
  }
}

// Functions for inserting records. If we were injesting large amounts of data, we would send batches of inserts rather
// than individual commands. Also we would be using prepared statements.

async function insertQuestion(
  client: pg.Client,
  id: number,
  title: string,
  htmlBody: string,
  creation: number,
  score: number,
  userId: number,
) {
  await client.query(
    "INSERT INTO questions (id, title, html_body, text_body, creation, score, user_id) VALUES ($1, $2, $3, $4, to_timestamp($5), $6, $7)",
    [id, title, htmlBody, htmlToPlainText(htmlBody), creation, score, userId],
  );
}

// Inserts a comment on a question.
async function insertQuestionComment(
  client: pg.Client,
  id: number,
  questionId: number,
  htmlBody: string,
  userId: number,
) {
  await client.query(
    "INSERT INTO q_comments (id, question_id, html_body, user_id) VALUES ($1, $2, $3, $4);",
    [id, questionId, htmlBody, userId],
  );
}

// Inserts an answer to a question
async function insertAnswer(
  client: pg.Client,
  id: number,
  questionId: number,
  htmlBody: string,
  creation: number,
  score: number,
  userId: number,
  accepted: boolean,
) {
  await client.query(
    "INSERT INTO answers (id, question_id, html_body, text_body, creation, score, user_id, accepted) VALUES ($1, $2, $3, $4, to_timestamp($5), $6, $7, $8);",
    [
      id,
      questionId,
      htmlBody,
      htmlToPlainText(htmlBody),
      creation,
      score,
      userId,
      accepted,
    ],
  );
}

// Inserts a comment on an answer
async function insertAnswerComment(
  client: pg.Client,
  id: number,
  answerId: number,
  htmlBody: string,
  userId: number,
) {
  await client.query(
    "INSERT INTO a_comments (id, answer_id, html_body, user_id) VALUES ($1, $2, $3, $4);",
    [id, answerId, htmlBody, userId],
  );
}

async function insertUserIfNotExists(
  client: pg.Client,
  id: number,
  name: string,
) {
  await client.query(
    "INSERT INTO users (id, name) VALUES ($1, $2) ON CONFLICT(id) DO NOTHING",
    [id, name],
  ); // upsert
}
