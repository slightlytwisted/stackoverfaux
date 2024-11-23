# Stackoverfaux - DH

This is an implementation of the [Sayari Full Stack Developer Code Challenge](https://gist.github.com/jameslaneconkling/48359a00c4ff6d4657bec71c799e7821).

## Running

[`docker-compose.yaml`](./docker-compose.yaml) defines a Docker stack that will build the application, spin up a
Postgres database, create the `stackoverfaux` database, populate it with the data contained in
[`stackoverfaux.json`](./stackoverfaux.json), and then start up the application on local port `3000`.

```
docker compose up
```

If everything work successfully, you should eventually see the output `Server running on port 3000`.

Once the stack is running, various endpoints can be hit using `curl`or your favorite REST client (e.g. Postman). Pipe
the response through `jq` (if you have it installed) to pretty-print the returned JSON.

```
# Search questions for the phrase "compile"
curl http://localhost:3000/api/v1/search?q=compile | jq

# Get details and full-text body for a specific question
curl http://localhost:3000/api/v1/questions/68463071 | jq

# Get all comments on a question
curl http://localhost:3000/api/v1/questions/68463071/comments | jq

# Get all answers for a question (sorted by accepted, then score)
curl http://localhost:3000/api/v1/questions/68462872/answers | jq

# Get all users
curl http://localhost:3000/api/v1/users | jq

# Get a specific user
curl http://localhost:3000/api/v1/users/14531062 | jq
```
## Files of Interest

- [`src/server.ts`](./src/server.ts): NodeJS Express app that implements the REST API
- [`src/dbinit.ts`](./src/dbinit.ts): Initializes the database and handles database migrations. Running `dbinit` is
  idempotent, unless the environment variable `DELETE_DB` is set to `true`.
- [`src/dbload.ts`](./src/dbload.ts): Populates the database with data from the JSON file indicated by the
    `DB_DATA_FILE` environment variable.

## NPM Scripts

The following scripts are defined in the [`package.json`](./package.json) file:

- `build`: Runs the following sub-scripts:
  - `build-ts`: Runs `tsc` to transpile TypeScript to JavaScript. See [`tsconfig.json`](./tsconfig.json) for
     build configuration.
  - `lint`: Runs `eslint`. See [`eslint.config.mjs`](./eslint.config.mjs) for linting configuration.
  - `pretty-check`: Runs `prettier` with `--check`. See [`.prettierignore`](./.prettierignore) and
     [`.prettierrc`](./.prettierrc) for code formatting configuration.
- `dbreset`: Sets `DELETE_DB=true` to force recreation of the database and then runs the following sub-scripts:
  - `dbinit`: Initializes the database. If the environment variable `DELETE_DB=true` is set, the database will be
    dropped and then recreated. Otherwise, running `dbinit` is idempotent. See [`.env`](./.env) for environment
    variables.
  - `dbload`: Loads data into the database. See [`.env`](./.env) for environment variables.
- `prettify`: Runs `prettier` with `--write`. See [`.prettierignore`](./.prettierignore) and [`.prettierrc`](./.prettierrc)
   for code formatting configuration.
- `serve`: Starts the application. See [`.env`](./.env) for environment variables.

## Additional Files

- [`.env`](./.env): Defines development environment variables used by various `npm` scripts.
- [`.prettierignore`](./.prettierignore), [`.prettierrc`](./.prettierrc): Configuration files for the `prettier` code
  formatter.
- [`Dockerfile`](./Dockerfile): Docker file for use with `docker build`.
- [`eslint.config.mjs`](./eslint.config.mjs): Configuration file for the `eslint` linter.
- [`stackoverfaux.json`](./stackoverfaux.json): Sample data file, for use with `dbload`
- [`tsconfig.json`](./tsconfig.json): TypeScript configuration file


## Dev Environment Setup

The following steps can be used to setup a dev environment in WSL2 (Ubuntu) on Windows 10:

1. Install Fast Node Manager (fnm):

```
sudo apt install unzip
curl -fsSL https://fnm.vercel.app/install | bash
source ~/.bashrc
```

2. Install Node 22:

```
fnm use --install-if-missing 22
node -v # v22.11.0
npm -v # 10.9.0 
```

3. Install dependencies:

```
npm install
```

4. Build the application:

```
npm run build
```

5. Spin up a local postgres instance in Docker:

```
docker run -d --name postgres \
-e POSTGRES_PASSWORD=postgres \
-e POSTGRES_USER=postgres \
-e POSTGRES_DB=stackoverfaux \
-p 5432:5432 \
postgres
```

6. Rebuild and load the database:

```
npm run dbreset
```

7. Start the application:

```
npm run serve
```

## References

Here are some of the more interesting websites and StackOverflow questions I relied on in developing this solution:

- https://stackoverflow.com/questions/35803306/directory-structure-for-typescript-projects
- https://github.com/microsoft/TypeScript-Node-Starter/blob/master/README.md
- https://github.com/microsoft/TypeScript-Node-Starter/blob/master/package.json
- https://github.com/microsoft/TypeScript-Node-Starter/blob/master/tsconfig.json
- https://medium.com/@mateogalic112/how-to-build-a-node-js-api-with-postgresql-and-typescript-best-practices-and-tips-84fee3d1c46c
- https://commandprompt.com/education/postgresql-create-database-if-not-exists/
- https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html
- https://stackoverflow.com/questions/52104833/how-to-create-table-after-first-creating-a-database-with-node-and-pg
- https://stackoverflow.com/questions/4069718/postgres-insert-if-does-not-exist-already
- https://www.crunchydata.com/blog/postgres-full-text-search-a-search-engine-in-a-database
- https://stackoverflow.com/questions/30967822/when-do-i-use-path-parameters-vs-query-parameters-in-a-restful-api

