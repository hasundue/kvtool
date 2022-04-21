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

type Method = "GET" | "POST" | "PUT";

export async function readConfig(path: string) {
  const toml = await Deno.readTextFile(path);
  const object = parse(toml);

  const config: Config = {
    accountId: object["account_id"] as string,
    apiToken: object["api_token"] as string,
  };

  return config;
}

async function fetchAPI(
  options: Options,
  endpoint: string,
  method: Method,
  body?: Record<string, unknown> | Record<string, unknown>[],
) {
  const { accountId, apiToken } = await readConfig(options.config);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/${endpoint}`,
    {
      method: method,
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );

  if (endpoint.includes("/values/")) {
    return await response.json();
  }

  const object: ApiResponse = await response.json();

  if (!object.success) {
    const errors = object.errors;
    const messages = errors.map(error => ApiError.stringify(error));
    throw Error(messages.join("\n"));
  }

  return object;
}

async function getNamespaceId(options: Options, title: string) {
  const list = await listNamespaces(options, false);
  const namespace = list.find(namespace => namespace.title === title);

  return namespace ? namespace.id : undefined;
}

async function listNamespaces(options: Options, verbose = true) {
  const response = await fetchAPI(options, "namespaces", "GET") as ApiResponse;

  const namespaces = response.result as { 
    id: string, 
    title: string,
    support_url_encoding: boolean 
  }[];

  if (verbose) {
    namespaces.forEach(namespace => {
      console.log(namespace.title);
    });
  }

  return namespaces;
}

async function renameNamespace(options: Options, src: string, dest: string) {
  const id = await getNamespaceId(options, src);

  if (!id) {
    throw Error(`Namespace ${src} not found`);
  }

  const data = { title: dest };
  await fetchAPI(options, `namespaces/${id}`, "PUT", data);

  console.log(`Renamed ${src} to ${dest}`);
}

async function createNamespace(options: Options, title: string, verbose = true) {
  const response = await fetchAPI(options, `namespaces`, "POST", { title });
  const { id }: { id: string } = response.result;

  if (verbose) {
    console.log(`Created a namespace ${title} (${id})`);
  }

  return id;
}

async function copyNamespace(options: Options, src: string, dest: string) {
  const srcId = await getNamespaceId(options, src);
  
  if (!srcId) {
    throw Error(`Namespace ${src} not found.`);
  }

  const response = await fetchAPI(options, `namespaces/${srcId}/keys`, "GET");

  const keys = response.result as {
    name: string,
    expiration?: number,
    metadata?: { [key: string]: string }, 
  }[];

  const destId = await getNamespaceId(options, dest) ?? await createNamespace(options, dest, false);

  const pairs = await Promise.all(keys.map(async key => {
    const value = await fetchAPI(options, `namespaces/${srcId}/values/${key.name}`, "GET");
    if (!value) {
      throw Error(`Value not found for a key ${key.name}.`);
    }
    return {
      key: key.name,
      value: JSON.stringify(value),
    };
  }));

  await fetchAPI(options, `namespaces/${destId}/bulk`, "PUT", pairs);

  console.log(`Copied a namespace ${src} to ${dest}`);
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

    // create
    .command("create <title>", "Create a namespace")
    .action((options, title: string) => createNamespace(options, title))

    // rename
    .command("rename <src> <dest>", "Rename a namespace")
    .action((options, src: string, dest: string) => renameNamespace(options, src, dest))

    // copy
    .command("copy <src> <dest>", "Copy a namespace")
    .action((options, src: string, dest: string) => copyNamespace(options, src, dest))

    .parse(Deno.args)
}
catch (error) {
  console.log(error);
}
