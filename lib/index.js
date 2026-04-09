//=======================================================//

import chalk from 'chalk';

console.log(
  chalk.blueBright.bold("\n• Baileys Mod Pro v9.0.0")
);

console.log(
  chalk.cyanBright("• Telegram: ") + 
  chalk.greenBright.bold("https://t.me/Fyxzpedia")
);

console.log(
  chalk.gray.dim("------------------------------\n")
);

import makeWASocket from "./Socket/index.js";
//=======================================================//
export * from "./Defaults/index.js";
export * from "./WABinary/index.js";
export * from "../WAProto/index.js";
export * from "./WAUSync/index.js";
export * from "./Store/index.js";
export * from "./Utils/index.js";
export * from "./Types/index.js";
export * from "./WAM/index.js";
//=======================================================//
export { makeWASocket };
export default makeWASocket;
//=======================================================//