const webpackRequireContext = require.context('./plugins', false, /\.js$/);
export const contents = webpackRequireContext.keys().reduce((memo, fileName) => memo.set(fileName.match(/\.\/([^\.]+)\.*/)[1], webpackRequireContext(fileName)), new Map())

const datasetTabsPlugins = [...contents.keys()].map(key => ({
  id: key,
  name: key,
  component: contents.get(key),
  checkActive: (dataset) => dataset
}));

export const plugins = {
  datasetTabs:datasetTabsPlugins,
  distributionTabs: []
}
