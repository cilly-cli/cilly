# Specification

Code snippets that we would like to be able to write with Cilly. 

## Creating a command
```typescript
cilly
  .command('start-project <something> [optional] [...optionals]')
  .description('Start a project')
  .withOptions([
    { signature: '-p, --project-name <name>', description: 'Open a project', validate: validateProjectName, handleUnassigned: promptProjectName },
    { signature: '-o, --out-dir [dir]', description: 'Write to this directory', validate: validateDirectory, defaultValue: './' }
    { signature: '-a, --auto-start', description: 'Start the project automatically', prompt: promptAutoStart, negate: true }
  ])
  .withHandler(handleStartProject)
```

When running `start-project --help`, the following should be seen: 
```
Usage: start-project <something> [optional] [...optionals]

Start a project.

Options: 
  -p, --project-name <name>      Open a project
  -o, --out-dir <dir>            Write to this directory (defaults to ./)
  -a, --auto-start               Start the project automatically (negate with --no-auto-start)
```

When running the `start-project` command, the following objects should be passed to handleStartProject:
```typescript
type Arguments = {
  something: string,
  optional?: string,
  optionals?: string[]
}
type Options = {
  projectName: string,
  outDir: string,
  autoStart: boolean
}
```