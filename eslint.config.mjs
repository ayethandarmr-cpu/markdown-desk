import tseslint from 'typescript-eslint'
export default [{ignores:['dist/**','dist-mock/**','playwright-report/**','test-results/**']}, ...tseslint.configs.recommended]
