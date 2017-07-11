import DatasetVisualisation from './DatasetVisualisation/DatasetVisualisation';

export const plugins = {
  datasetTabs: [
      {id: 'visualisation', name: 'Visualization', isActive: true, Component: DatasetVisualisation, checkActive: (dataset) => dataset}
  ],
  distributionTabs: []
}
