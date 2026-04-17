export default {
  checkIgnorePragma: true,
  jsxSingleQuote: false,
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
  singleQuote: true,
  trailingComma: 'all',
};
