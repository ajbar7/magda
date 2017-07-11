var path = require('path');

module.exports = {
  entry: {
     index: './src/index.js'
  },
  module : {
    loaders : [
      {
        test : /\.js?/,
        include : path.resolve(__dirname, 'src'),
        loader : 'babel-loader'
      }
    ]
  },
  output: {
    filename: '[name].bundle.js',
    chunkFilename: '[name].bundle.js',
    path: path.resolve(__dirname, 'dist')
  }
};
