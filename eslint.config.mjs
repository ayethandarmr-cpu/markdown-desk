import tseslint from 'typescript-eslint'
export default [{ignores:['.wrangler/**','dist-e2e/**','dist/**','dist-mock/**','playwright-report/**','test-results/**']}, ...tseslint.configs.recommended]
