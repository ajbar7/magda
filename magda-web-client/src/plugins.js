import DatasetVisualisation from '../plugins/DatasetVisualisation';
debugger


export const plugins = {
  datasetTabs: [
      {id: 'visualisation', name: 'Visualization', isActive: true, Component: DatasetVisualisation, checkActive: (dataset) => dataset}
  ],
  distributionTabs: []
}
