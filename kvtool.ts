import { parse } from "https://deno.land/std@0.136.0/encoding/toml.ts";

type Config = {
  accountId: string;
  apiToken: string;
};

type ApiResponse = {
  success: boolean;
  errors: ApiError[];
  messages: string[];
  [field: string]: unknown;
};

type ApiError = {
  code: number;
  message: string;
};

const ApiError = {
  stringify(error: ApiError) { 
    return `${error.code}: ${error.message}`;
  },
};

type Method = "GET" | "PUT";

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

  const object: ApiResponse = await response.json();

  if (!object.success) {
    const errors = object.errors;
    const messages = errors.map(error => ApiError.stringify(error));
    throw Error(messages.join("\n"));
  }

  return object;
}

function assertNumberOfArgs(args: string[], num: number) {
  if (args.length !== num) {
    throw Error(`Wrong number of arguments: expected ${num}, but got ${args.length}.`)
  }
}

async function listNamespaces(args: string[], config: Config) {
  assertNumberOfArgs(args, 0);

  const response = await fetchAPI(config, "storage/kv/namespaces", "GET");

  const namespaces = response.result as { 
    id: string, 
    title: string,
    support_url_encoding: boolean 
  }[];

  return namespaces;
}

async function renameNamespace(args: string[], config: Config) {
  assertNumberOfArgs(args, 2);
  const [ from, to ] = args;

  const list = await listNamespaces([], config);
  const namespace = list.find(namespace => namespace.title === from);

  if (!namespace) {
    throw Error(`Namespace ${from} not found`);
  }

  const data = { title: to };

  await fetchAPI(config, `storage/kv/namespaces/${namespace.id}`, "PUT", data);

  console.log(`Renamed ${from} to ${to}`);
}

if (import.meta.main) {
  try {
    const config = await readConfig("./wrangler.toml");

    const command = Deno.args[0];
    const args = Deno.args.slice(1);

    switch (command) {
      case "ls": {
        const namespaces = await listNamespaces(args, config);
        namespaces.forEach(namespace => {
          console.log(namespace.title);
        });
        break;
      }
      case "mv":
        await renameNamespace(args, config);
        break;
      default: 
        throw Error(`Unknown command: ${command}`);
    }
  }
  catch(error) {
    console.log(error);
  }
}
