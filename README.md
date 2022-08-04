# prechoster
A graph-based HTML generator to make fancy chosting easier.

## Overview
Documents are a directed graph of modules.
Every module is JSON data associated with a plugin implementation.
The plugin implementation evaluates result `Data` and provides it to connected modules on the graph.
Modules have “sends,” which simply input data into other modules in evaluation order,
and “named sends,” which are sort of like side inputs that don’t make sense as regular inputs (e.g. variable definitions).

Plugins are defined in `src/plugins` (indexed in `src/plugins/index.tsx`) and are composed of a module data interface, a UI component that edits module data, and an evaluation function.

Do not change module data interfaces in a backwards-incompatible way because people are apparently using this software sometimes!!

### Building
in the repository:

```sh
npm install
npm run build # or npm run watch
```

Look in `static` for the output.

### Browser Support
Major feature gates:

- script type module
- dialog element

According to caniuse, this means:

- Firefox 98
- Safari 15.4
- Chrome 63
