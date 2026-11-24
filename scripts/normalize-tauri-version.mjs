// 发布构建前把 Cargo.toml / tauri.conf.json 的 semver 前导零去掉。
//
// 仓库版本号规则（AGENTS.md §9）要求 Z 两位补零（如 2.0.07），
// 但 Cargo 与 Tauri CLI 都按 semver 解析，会拒绝前导零：
//   error: invalid leading zero in patch version number
// 因此发布流水线在干净 checkout 上先跑本脚本，把 2.0.07 → 2.0.7，
// 不修改仓库中的源码提交。

import { readFileSync, writeFileSync } from 'node:fs';

const stripLeadingZero = (_match, major, minor, patch) =>
  `version = "${major}.${minor}.${Number(patch)}"`;

const cargoPath = 'apps/helper/src-tauri/Cargo.toml';
const cargo = readFileSync(cargoPath, 'utf8');
const cargoFixed = cargo.replace(
  /^version = "(\d+)\.(\d+)\.0+(\d+)"$/m,
  stripLeadingZero
);
if (cargoFixed === cargo) {
  console.log('Cargo.toml: version already valid or not found');
} else {
  writeFileSync(cargoPath, cargoFixed);
  console.log('Cargo.toml:', cargoFixed.match(/^version = .*$/m)[0]);
}

const confPath = 'apps/helper/src-tauri/tauri.conf.json';
const conf = readFileSync(confPath, 'utf8');
const confFixed = conf.replace(
  /"version": "(\d+)\.(\d+)\.0+(\d+)"/,
  (_match, major, minor, patch) =>
    `"version": "${major}.${minor}.${Number(patch)}"`
);
if (confFixed === conf) {
  console.log('tauri.conf.json: version already valid or not found');
} else {
  writeFileSync(confPath, confFixed);
  console.log('tauri.conf.json:', confFixed.match(/"version": .*/)[0]);
}
