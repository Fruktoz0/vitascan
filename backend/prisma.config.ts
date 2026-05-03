import { defineConfig } from "@prisma/config";
import { config } from "dotenv";
import { existsSync } from "fs";
import path from "path";

// A Prisma CLI gyakran a `backend` mappából fut; a compose-os projekteknél a változók gyakran a repo gyökér `.env`-ben vannak.
const backendEnv = path.resolve(process.cwd(), ".env");
const rootEnv = path.resolve(process.cwd(), "..", ".env");
if (existsSync(backendEnv)) config({ path: backendEnv });
else if (existsSync(rootEnv)) config({ path: rootEnv });

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL as string,
  },
});