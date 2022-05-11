# kvtool
CLI utility for Cloudflare Workers KV

## Installation
```
deno install --allow-net --allow-read --allow-write https://deno.land/x/kvtool@v0.3.0/kvtool.ts
```

## Setup
You need to set account_id and api_token in wrangler.toml:

```toml
account_id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
api_token = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

## Usage
```
Usage:   kvtool
Version: 0.3.0

Description:

  CLI utility for Cloudflare Workers KV

Options:

  -h, --help             - Show this help.
  -V, --version          - Show the version number for this program.
  -c, --config   <path>  - Path to a configuration file               (Default: "./wrangler.toml")

Commands:

  list                   - List namespaces owned by your account
  create  <title>        - Create a namespace
  rename  <src> <dest>   - Rename a namespace
  copy    <src> <dest>   - Copy a namespace
  clear   <title>        - Delete all key-value pairs in a namespace
  dump    <title> <dir>  - Dump a namespace into files
```

## Acknowledgement
The development of **kvtool** is supported by [Active Connector Inc.](https://www.active-connector.com/)
