# Vite.js + D3.js Project

A modern data visualization project built with Vite.js and D3.js, offering fast development experience and powerful data visualization capabilities.

## Features

- ⚡ **Fast Development**: Built with Vite.js for lightning-fast HMR (Hot Module Replacement)
- 📊 **Powerful Visualizations**: Leverage D3.js for custom, interactive data visualizations
- 🎨 **Modern Styling**: Support for CSS modules, SCSS, and Tailwind CSS
- 📱 **Responsive Design**: Create visualizations that work across all device sizes
- 🧪 **Testing**: Integrated testing setup with Vitest
- 📦 **Optimized Builds**: Production-ready builds with tree-shaking and code splitting

## Installation

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Steps

1. Clone the repository:
```bash
git clone <repository-url>
cd vitejs-d3
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

## Usage

### Development

Start the development server:
```bash
npm run dev
# or
yarn dev
```

Open your browser and navigate to `http://localhost:5173`

### Build

Create a production build:
```bash
npm run build
# or
yarn build
```

Preview the production build:
```bash
npm run preview
# or
yarn preview
```

## Project Structure

```
├── src/
│   ├── components/       # Reusable components
│   ├── data/             # Data files
│   ├── visualizations/   # D3.js visualizations
│   ├── styles/           # CSS/SCSS files
│   ├── utils/            # Utility functions
│   ├── App.jsx           # Main application component
│   └── main.jsx          # Entry point
├── public/               # Static assets
├── index.html            # HTML template
├── package.json          # Dependencies and scripts
├── vite.config.js        # Vite configuration
└── README.md             # This file
```

## Technologies Used

- **Vite.js**: Next-generation frontend build tool
- **D3.js**: Data-driven document visualization library
- **React**: JavaScript library for building user interfaces
- **Vitest**: Unit testing framework
- **ESLint**: Code linting tool
- **Prettier**: Code formatter

## Creating Visualizations

To create a new D3.js visualization:

1. Create a new file in the `src/visualizations/` directory
2. Import D3.js and create your visualization function
3. Use the visualization component in your React components

Example:

```javascript
// src/visualizations/BarChart.js
import * as d3 from 'd3';

export const createBarChart = (container, data) => {
  // D3.js code to create bar chart
};
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgements

- [Vite.js](https://vitejs.dev/)
- [D3.js](https://d3js.org/)
- [React](https://react.dev/)


- 改 coordinate system， link 没有更新
- size_uniform 的逻辑
- 数据保留，container
- 轴 exchange，右边 加按钮