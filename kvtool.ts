import { Command } from "https://deno.land/x/cliffy@v0.24.2/command/mod.ts";
import { parse } from "https://deno.land/std@0.138.0/encoding/toml.ts";
import { ensureDir } from "https://deno.land/std@0.138.0/fs/mod.ts";
import { join } from "https://deno.land/std@0.138.0/path/mod.ts";

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

type Method = "GET" | "POST" | "PUT" | "DELETE";

async function readConfig(path: string) {
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
  category: string,
  action: string,
  method: Method,
  body?: Record<string, unknown> | Record<string, unknown>[] | string[],
) {
  const { accountId, apiToken } = await readConfig(options.config);

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/${category}/${action}`,
    {
      method: method,
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );

  if (action.includes("/values/")) {
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

type Namespace = {
  id: string;
  title: string;
  support_url_encoding: boolean;
}

async function listNamespaces(options: Options, verbose = true) {
  const perPage = 20;
  let page = 1;
  let namespaces: Namespace[] = [];

  while (true) {
    const response = await fetchAPI(
      options,
      "storage/kv",
      `namespaces?page=${page}&per_page=${perPage}&order=title`,
      "GET"
    ) as ApiResponse;

    const result = response.result as Namespace[];
    namespaces = namespaces.concat(result);

    if (result.length < perPage) break;

    page++;
  }

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
  await fetchAPI(options, "storage/kv", `namespaces/${id}`, "PUT", data);

  console.log(`Renamed ${src} to ${dest}`);
}

async function createNamespace(options: Options, title: string, verbose = true) {
  const response = await fetchAPI(options, "storage/kv", `namespaces`, "POST", { title });
  const { id }: { id: string } = response.result;

  if (verbose) {
    console.log(`Created a namespace ${title} (${id})`);
  }

  return id;
}

async function copyNamespace(options: Options, src: string, dest: string) {
  const pairs = await bulkGetNamespace(options, src);

  const destId = await getNamespaceId(options, dest) ?? await createNamespace(options, dest, false);
  await fetchAPI(options, "storage/kv", `namespaces/${destId}/bulk`, "PUT", pairs);

  console.log(`Copied a namespace ${src} to ${dest}`);
}

async function bulkGetNamespace(options: Options, title: string) {
  const srcId = await getNamespaceId(options, title);
  
  if (!srcId) {
    throw Error(`Namespace ${title} not found.`);
  }

  const response = await fetchAPI(options, "strage/kv", `namespaces/${srcId}/keys`, "GET");

  const keys = response.result as {
    name: string,
    expiration?: number,
    metadata?: { [key: string]: string }, 
  }[];

  return await Promise.all(keys.map(async key => {
    const value = await fetchAPI(options, "storage/kv", `namespaces/${srcId}/values/${key.name}`, "GET");
    if (!value) {
      throw Error(`Value not found for a key ${key.name}.`);
    }
    return {
      key: key.name,
      value,
    };
  }));
}

async function clearNamespace(options: Options, title: string) {
  const id = await getNamespaceId(options, title);
  
  if (!id) {
    throw Error(`Namespace ${title} not found.`);
  }

  const response = await fetchAPI(options, "storage/kv", `namespaces/${id}/keys`, "GET");

  const keys = response.result as {
    name: string,
    expiration?: number,
    metadata?: { [key: string]: string }, 
  }[];

  const keyNames = keys.map(key => key.name);

  await fetchAPI(options, "storage/kv", `namespaces/${id}/bulk`, "DELETE", keyNames);

  console.log(`Deleted all key-value paris in ${title}`);
}

async function dumpNamespace(options: Options, title: string, dir: string) {
  const pairs = await bulkGetNamespace(options, title);

  ensureDir(dir);
  await Promise.all(pairs.map(pair => {
    return Deno.writeTextFile(join(dir, pair.key), JSON.stringify(pair.value))
  }));

  console.log(`Dumped all key-value paris in ${title} into ${dir}`);
}

async function listBindings(options: Options, project: string) {
  const response = await fetchAPI(options, "pages/projects", `${project}`, "GET");
  const bindings = response.result.deployment_configs.production.kv_namespaces;
  const keys = Object.keys(bindings);
  keys.forEach(key => console.log(key));
}

type Options = {
  config: string;
};

try { 
  await new Command()
    // kvtool
    .name("kvtool")
    .version("0.4.0")
    .description("CLI utility for Cloudflare Workers KV")
    .globalOption(
      "-c --config <path>",
      "Path to a configuration file",
      { default: "./wrangler.toml" }
    )

    // list
    .command("list", "List namespaces owned by your account")
    .action((options: Options) => listNamespaces(options))

    // create
    .command("create <title>", "Create a namespace")
    .action((options: Options, title: string) => createNamespace(options, title))

    // rename
    .command("rename <src> <dest>", "Rename a namespace")
    .action((options: Options, src: string, dest: string) => renameNamespace(options, src, dest))

    // copy
    .command("copy <src> <dest>", "Copy a namespace")
    .action((options: Options, src: string, dest: string) => copyNamespace(options, src, dest))

    // clear
    .command("clear <title>", "Delete all key-value pairs in a namespace")
    .action((options: Options, title: string) => clearNamespace(options, title))

    // dump
    .command("dump <title> <dir:file>", "Dump a namespace into files")
    .action((options: Options, title: string, dir: string) => dumpNamespace(options, title, dir))

    // pages
    .command("pages <project>", "List variables binded to KV namespaces in a Pages project")
    .action((options: Options, project: string) => listBindings(options, project))

    .parse(Deno.args)
}
catch (error) {
  console.log(error);
}
