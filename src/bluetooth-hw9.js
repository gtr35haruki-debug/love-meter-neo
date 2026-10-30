// COOSPO HW9 uses the standard Bluetooth Heart Rate Service on supported firmware.
const HR_SERVICE=0x180D;
const HR_MEASUREMENT=0x2A37;

export class HeartRateSensor {
  constructor(side,onData,onStatus){this.side=side;this.onData=onData;this.onStatus=onStatus;this.device=null;this.characteristic=null;this._handler=null;}
  static apiSupported(){return !!navigator.bluetooth;}
  static async availability(){
    if(!navigator.bluetooth) return false;
    if(typeof navigator.bluetooth.getAvailability==='function') return navigator.bluetooth.getAvailability();
    return true;
  }
  async connect(){
    if(!navigator.bluetooth) throw new Error('Web Bluetooth is not available');
    this.onStatus?.({state:'SELECTING'});
    this.device=await navigator.bluetooth.requestDevice({filters:[{services:[HR_SERVICE]}],optionalServices:[HR_SERVICE]});
    this.device.addEventListener('gattserverdisconnected',()=>this.onStatus?.({state:'DISCONNECTED'}));
    const server=await this.device.gatt.connect();
    const service=await server.getPrimaryService(HR_SERVICE);
    this.characteristic=await service.getCharacteristic(HR_MEASUREMENT);
    this._handler=(e)=>{
      const value=e.target.value; const flags=value.getUint8(0); const is16=flags&0x01;
      const bpm=is16?value.getUint16(1,true):value.getUint8(1);
      this.onData?.({bpm,receivedAtMs:Date.now(),deviceId:this.device?.id||'hw9'});
    };
    this.characteristic.addEventListener('characteristicvaluechanged',this._handler);
    await this.characteristic.startNotifications();
    this.onStatus?.({state:'CONNECTED',name:this.device.name||'HW9',id:this.device.id});
  }
  async disconnect(){
    try{if(this.characteristic&&this._handler)this.characteristic.removeEventListener('characteristicvaluechanged',this._handler);}catch{}
    try{this.device?.gatt?.disconnect();}catch{}
    this.onStatus?.({state:'DISCONNECTED'});
  }
}

export class DemoHeartRateSensor {
  constructor(side,onData,onStatus){this.side=side;this.onData=onData;this.onStatus=onStatus;this.timer=null;this.t=0;}
  async connect(){
    this.onStatus?.({state:'CONNECTED',name:'DEMO HR',id:`demo-${this.side}`});
    const phaseShift=this.side==='A'?0:0.7;
    this.timer=setInterval(()=>{
      this.t+=1;
      const base=this.side==='A'?74:77;
      const wave=5*Math.sin(this.t/5+phaseShift)+2*Math.sin(this.t/2.3+phaseShift);
      const bpm=Math.max(48,Math.round(base+wave+(Math.random()-.5)*2));
      this.onData?.({bpm,receivedAtMs:Date.now(),deviceId:`demo-${this.side}`});
    },1000);
  }
  async disconnect(){clearInterval(this.timer);this.timer=null;this.onStatus?.({state:'DISCONNECTED'});}
}
