function getComponent(){
  return import (/* webpackChunkName: "DatasetVisualisation" */ 'DatasetVisualisation').then(module=>{
    return module
  }).catch(error=> 'an error occurred when loading this plugin');
}

getComponent().then(plugin => plugin);
