/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        /* ---- 产业链侦察兵 品牌设计令牌 ---- */
        brand: {
          DEFAULT: '#C7000B',
          deep: '#A20009',
          dark: '#8E0007',
          soft: 'rgba(199,0,11,.07)',
          soft2: 'rgba(199,0,11,.12)',
        },
        ink: {
          DEFAULT: '#14224A',   // 主文字（深蓝，替代纯黑）
          soft: '#4A5578',      // 次级文字
          mute: '#8A93AD',      // 辅助文字
          faint: '#B4BBCB',     // 占位 / 极弱
        },
        hairline: {
          DEFAULT: '#E9ECF3',
          soft: '#F2F4F8',
        },
        up: '#C7000B',          // 涨 = 红（中国市场惯例）
        down: '#0F9D58',        // 跌 = 绿

        background: 'var(--td-bg-color-page)',
        foreground: 'var(--td-text-color-primary)',
        muted: {
          DEFAULT: 'var(--td-bg-color-component)',
          foreground: 'var(--td-text-color-secondary)',
        },
        border: 'var(--td-component-stroke)',
        input: 'var(--td-bg-color-component)',
        card: {
          DEFAULT: 'var(--td-bg-color-container)',
          foreground: 'var(--td-text-color-primary)',
        },
        accent: {
          DEFAULT: 'var(--td-brand-color)',
          foreground: 'var(--td-text-color-anti)',
          light: 'var(--td-brand-color-light)',
        },
        primary: {
          DEFAULT: 'var(--td-text-color-primary)',
          foreground: 'var(--td-bg-color-page)',
        }
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '20px',
      },
      animation: {
        'cursor-blink': 'blink 1s infinite',
      },
      keyframes: {
        blink: {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
  corePlugins: {
    preflight: false,
  }
}
