# TODOs 

1. Write unit tests with desired input and output
2. Write unit tests with desired input and errors
3. Throw CillyException objects instead of standard Errors so developers can catch and handle them as they please.
4. Formalise validation flow
5. Formalise hook flow
   - Should the value returned from a hook always be assigned?
   - Do hooks run before validation?
6. Separate parsing and processing, allow developers to handle processing themselves.
   - `parse()` should return the `arg`, `opts`, and `extra` objects.
   - `parseS()` should be synchronous.
   - `process()` should run validation, hooks, and invoke the appropriate command handler. 
7. Allow `process()` to return the result of the handler.
8. Create examples with libraries like `prompt` and `inquirerjs` for hooks
