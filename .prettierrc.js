export default {
  checkIgnorePragma: true,
  singleQuote: true,
  jsxSingleQuote: false,
  trailingComma: 'all',
  overrides: [
    {
      files: ['*.json5', '*.jsonc', 'tsconfig.json', 'tsconfig.*.json'],
      options: {
        parser: 'jsonc',
        singleQuote: false,
        trailingComma: 'all',
      },
    },
  ],
};
