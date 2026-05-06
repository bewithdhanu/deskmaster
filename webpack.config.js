const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

module.exports = {
  entry: {
    main: './src/index.js',
    tray: './src/tray.js',
    about: './src/about.js'
  },
  devtool: false,
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    globalObject: 'globalThis'
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/templates/index.html',
      filename: 'index.html',
      chunks: ['main'],
      inject: 'body'
    }),
    new HtmlWebpackPlugin({
      template: './src/templates/tray-icon.html',
      filename: 'tray-icon.html',
      chunks: ['tray'],
      inject: 'body'
    }),
    new HtmlWebpackPlugin({
      template: './src/templates/about.html',
      filename: 'about.html',
      chunks: ['about'],
      inject: 'body'
    }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'assets/icons/app-icon-256.png',
          to: 'assets/icons/app-icon-256.png'
        },
        {
          from: path.resolve(__dirname, 'node_modules/monaco-editor/min/vs'),
          to: 'vs'
        }
      ]
    }),
    new webpack.DefinePlugin({
      global: 'globalThis'
    }),
    new MonacoWebpackPlugin({
      languages: ['markdown']
    })
  ],
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader',
          'postcss-loader',
        ],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx'],
  },
  target: 'web',
  devServer: {
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    port: 3000,
    hot: true,
  },
};
