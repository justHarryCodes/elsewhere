// Physics entry point: import from "@game/shared/physics". Kept apart from the main entry so code
// that only needs constants and types doesn't pull in the Rapier engine (~2 MB of WebAssembly).

export * from "./physics-config";
export * from "./physics-core";
export * from "./physics-extra";
export * from "./physics-vehicle";
