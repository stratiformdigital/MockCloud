import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const prefixColors = new Map<string, number>();
let maxPrefixLength = 0;

const formattedPrefix = (prefix: string) => {
  if (!prefixColors.has(prefix)) {
    prefixColors.set(prefix, (prefixColors.size % 14) + 1);
    if (prefix.length > maxPrefixLength) {
      maxPrefixLength = prefix.length;
    }
  }
  const color = prefixColors.get(prefix);
  return `\u001B[38;5;${color}m ${prefix.padStart(maxPrefixLength)}|\u001B[0m`;
};

export const runCommand = (
  prefix: string,
  cmd: string[],
  cwd: string,
) => {
  const fullPath = resolve(cwd);
  const startingPrefix = formattedPrefix(prefix);
  process.stdout.write(
    `${startingPrefix} Running: ${cmd.join(' ')}\n` +
      `\n${startingPrefix} CWD: ${fullPath}\n`
  );

  return new Promise<void>((resolve, reject) => {
    const proc = spawn(cmd[0], cmd.slice(1), { cwd: fullPath });

    proc.stdout.on('data', (data) => {
      const paddedPrefix = formattedPrefix(prefix);
      for (const line of data.toString().split('\n')) {
        process.stdout.write(`${paddedPrefix} ${line}\n`);
      }
    });

    proc.stderr.on('data', (data) => {
      const paddedPrefix = formattedPrefix(prefix);
      for (const line of data.toString().split('\n')) {
        process.stdout.write(`${paddedPrefix} ${line}\n`);
      }
    });

    proc.on('error', (error) => {
      const paddedPrefix = formattedPrefix(prefix);
      process.stdout.write(`${paddedPrefix} Error: ${error}\n`);
      reject(error);
    });

    proc.on('close', (code) => {
      const paddedPrefix = formattedPrefix(prefix);
      process.stdout.write(`${paddedPrefix} Exit: ${code}\n`);
      if (code !== 0) {
        reject(code);
        return;
      }
      resolve();
    });
  });
};

export const runAppCommand = (prefix: string, cmd: string, cwd: string) =>
  runCommand(prefix, ['zsh', '-lc', `nvm use > /dev/null && ${cmd}`], cwd);

export const nvmInstall = (cwd: string) =>
  runCommand('nvm install', ['zsh', '-lc', 'nvm install'], cwd);
