module.exports = [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.next/**', 'infra/**']
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: {}
  }
];
