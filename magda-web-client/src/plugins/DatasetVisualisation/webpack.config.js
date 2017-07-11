var path = require('path');

module.exports = {
  entry: './src/index.js',
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
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  }
};
