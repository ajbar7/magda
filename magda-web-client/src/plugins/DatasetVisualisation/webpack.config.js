module.exports = {
  entry: {
     index: './index.js'
  },
  plugins: [],
  output: {
    filename: '[name].bundle.js',
    chunkFilename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist')
  }
};
