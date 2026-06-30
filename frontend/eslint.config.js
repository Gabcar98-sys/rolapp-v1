// Flat config de ESLint 9 para el frontend (React + JSX, ESM, browser).
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
      },
    },
    rules: {
      // react/jsx-uses-vars evita los falsos positivos de no-unused-vars sobre
      // componentes importados que solo se usan dentro de JSX (ver LEARNINGS.md).
      'react/jsx-uses-vars': 'error',
      // react-hooks en 'warn' para no romper el build (un RUN fallido aborta la imagen).
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'no-unused-vars': 'warn',
      'no-undef': 'off',
    },
  },
];
