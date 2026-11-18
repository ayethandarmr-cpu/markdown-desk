import tseslint from 'typescript-eslint'
export default [{ignores:['dist-e2e/**','dist/**','dist-mock/**','playwright-report/**','test-results/**']}, ...tseslint.configs.recommended]
