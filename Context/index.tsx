import { AI, OpenAI } from "~/AI";
import { AWS } from "~/AWS";
import { DurableObject, Env } from "~/Server";

export type Context = {
  env: Env;
  durableObject: DurableObject;
  openAI: OpenAI.Client;
  cohere: AI.Cohere.Client;
  ragDB: AWS.DynamoDB.State;
  vectorDB: AI.Qdrant.Client;
};

export namespace Context {
  export const create = ({
    env,
    durableObject,
  }: Pick<Context, "env" | "durableObject">): Context => ({
    env,
    durableObject,
    openAI: OpenAI.Client.create(env),
    cohere: AI.Cohere.Client.create(env),
    ragDB: AWS.DynamoDB.State.create(env),
    vectorDB: AI.Qdrant.Client.create(env),
  });
}
