import { Command } from 'commander';
import { WeiboApi } from './api';
import { registerHotCommand } from './commands/hot';
import { registerSearchCommand } from './commands/search';
import { registerUserCommand } from './commands/user';
import { registerPostCommand } from './commands/post';

async function main(): Promise<void> {
  const program = new Command();
  const api = new WeiboApi();

  program
    .name('weibo')
    .description('Zero-login Weibo CLI')
    .version('0.1.0')
    .option('--verbose', 'Print request URLs and response status');

  program.hook('preAction', () => {
    if (program.opts().verbose) {
      api.verbose = true;
    }
  });

  registerHotCommand(program, api);
  registerSearchCommand(program, api);
  registerUserCommand(program, api);
  registerPostCommand(program, api);

  if (process.argv.length <= 2) {
    program.outputHelp();
    return;
  }

  await program.parseAsync(process.argv);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
