// Ambient declarations for modules that are available at runtime
// but not directly resolvable from the shared package due to pnpm hoisting
declare module 'googleapis' {
    export const google: any;
}
