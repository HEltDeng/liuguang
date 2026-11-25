export default [
  { ignores: ["node_modules/**", "交付成品/**", "private/**"] },
  {
    files: ["**/*.{js,mjs}"],
    rules: {
      "no-debugger": "error",
      "no-console": "error",
      "no-dupe-keys": "error",
      "no-unreachable": "error",
      "no-redeclare": "error",
      eqeqeq: ["error", "smart"],
      "no-constant-condition": "error",
    },
  },
];
