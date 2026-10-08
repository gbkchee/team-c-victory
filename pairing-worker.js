'use strict';
importScripts('data.js','profile-model.js','pairing-model.js');
self.onmessage=event=>{
 const {generation,profiles,options}=event.data;
 try{self.postMessage({generation,plans:self.PAIRING_MODEL.generate(self.BOARD_DATA,profiles,options)});}
 catch(error){self.postMessage({generation,error:error.message});}
};
