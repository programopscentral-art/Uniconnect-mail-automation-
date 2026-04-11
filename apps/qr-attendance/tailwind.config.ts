import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f0f4ff', 500: '#4F46E5', 600: '#4338CA', 700: '#3730A3' }
      }
    }
  },
  plugins: []
};
export default config;
