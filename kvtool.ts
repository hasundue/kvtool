import { Command } from "https://deno.land/x/cliffy@v0.23.0/command/mod.ts";
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

async function getNamespaceId(config: Config, title: string) {
  const response = await fetchAPI(config, "storage/kv/namespaces", "GET");

  const namespaces = response.result as { 
    id: string, 
    title: string,
    support_url_encoding: boolean 
  }[];

  const namespace = namespaces.find(namespace => namespace.title === title);

  if (!namespace) {
    throw Error(`Namespace ${title} not found`);
  }

  return namespace.id;
}

async function listNamespaces(options: Options) {
  const config = await readConfig(options.config);
  const response = await fetchAPI(config, "storage/kv/namespaces", "GET");

  const namespaces = response.result as { 
    id: string, 
    title: string,
    support_url_encoding: boolean 
  }[];

  namespaces.forEach(namespace => {
    console.log(namespace.title);
  });

  return namespaces;
}

async function renameNamespace(options: Options, src: string, dest: string) {
  const config = await readConfig(options.config);
  const id = await getNamespaceId(config, src);

  const data = { title: dest };

  await fetchAPI(config, `storage/kv/namespaces/${id}`, "PUT", data);

  console.log(`Renamed ${src} to ${dest}`);
}

type Options = {
  config: string;
};

try { 
  await new Command()
    // kvtool
    .name("kvtool")
    .version("0.1.0")
    .description("CLI utility for Cloudflare Workers KV")
    .globalOption(
      "-c --config <path>",
      "Path to a configuration file",
      { default: "./wrangler.toml" }
    )

    // list
    .command("list", "List namespaces owned by your account")
    .action((options) => listNamespaces(options))

    // rename
    .command("rename <src> <dest>", "Rename a namespace")
    .action((options, src: string, dest: string) => renameNamespace(options, src, dest))

    .parse(Deno.args)
}
catch (error) {
  console.log(error);
}
