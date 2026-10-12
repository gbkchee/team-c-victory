'use strict';
importScripts('data.js','profile-model.js?v=20261012-3','pairing-model.js?v=20261012-5');
self.onmessage=event=>{
 const {generation,profiles,options}=event.data;
 try{self.postMessage({generation,plans:self.PAIRING_MODEL.generate(self.BOARD_DATA,profiles,options)});}
 catch(error){self.postMessage({generation,error:error.message});}
};
