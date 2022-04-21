import { parse } from "https://deno.land/std@0.136.0/encoding/toml.ts";

type Config = {
  accountId: string;
  apiToken: string;
};

type Method = "GET" | "POST";

export async function readConfig(path: string) {
  const toml = await Deno.readTextFile(path);
  const object = parse(toml);

  const config: Config = {
    accountId: object["account_id"] as string,
    apiToken: object["api_token"] as string,
  };

  return config;
}

async function fetchAPI(config: Config, endpoint: string, method: Method, body?: Record<string, unknown>) {
  const { accountId, apiToken } = config;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/${endpoint}`, {
    method: method,
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const object: Record<string, unknown> = await response.json();
  return object;
}

async function listNamespaces(args: string[], config: Config) {
  if (args.length) {
    throw Error(`Wrong number of arguments: expected 0, but got ${args.length}.`)
  }
  const response = await fetchAPI(config, "storage/kv/namespaces", "GET");

  if (!response.success) {
    const errors = response.errors as string[];
    throw Error(errors.join("\n"));
  }

  const namespaces = response.result as { id: string, title: string, support_url_encoding: boolean }[];
  namespaces.forEach(namespace => {
    console.log(namespace.title);
  });
}

if (import.meta.main) {
  try {
    const config = await readConfig("./wrangler.toml");

    const command = Deno.args[0];
    const args = Deno.args.slice(1);

    switch (command) {
      case "ls": 
        await listNamespaces(args, config);
        break;
      default: 
        throw Error(`Unknown command: ${command}`);
    }
  }
  catch(error) {
    console.log(error);
  }
}
