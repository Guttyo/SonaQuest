// Cloudflare Workers の入口。default だけを出す（ほかの名前を出すと、Workers が起動しない）。

import { createApp } from "./app";

export default createApp();
