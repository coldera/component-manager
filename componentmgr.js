/**
 * @fileoverview 组件/模块 管理器
 */
 // ;(function() {
    var NULL = null;
    var DEBUG = false;
        
    var _util = (function() {
        var 
            to_string = Object.prototype.toString,
            re_string = /(?:^.* )|\]/g;
            
        return {
            getType: function(value) {
                return to_string.call(value).replace(re_string,'');
            },
            forEach: function(arr, callback, thisArg) {
                if(arr.forEach) {
                    arr.forEach(callback, thisArg);
                }else {
                    thisArg = thisArg || NULL;
                    
                    for(var i=0, len=arr.length; i<len; ++i) {
                        callback.call(thisArg, arr[i], i, arr);
                    }
                }
            },
            strIndexOf: function(str1, str2, symbol) {
                return (symbol+str1+symbol).indexOf(symbol+str2+symbol) != -1
            }
        };
    })();
    
    /**
    * @class ComponentMgr 组件管理器类
    * @property {Array} components 组件列表，添加的组件对象或实例都会增加到这个列表里
    * @property {Object} events 事件缓存，监听的事件处理函数会缓存到这里
    * @property {Object} cfg 用来保存组件群组的共用配置
    * components里每个元素都是object类型：{n: key, o: component} n是组件名称，o是组件对象或实例，可以存在多个同名组件
    */
    var ComponentMgr = function(settings) {

        // 组件列表
        this.components = [];
        // 事件缓存
        this.events = {};
        this.cfg = settings || {};
        
        // 初始时附带的组件
        var ex_components = this.cfg.exComponents;
        if(ex_components) {
            for(var _key in ex_components) {
                var _cpn = ex_components[_key];
                
                if(typeof _cpn != 'undefined') {
                    this.addComponent(_key, _cpn);
                }
            }
        }
        
        this.cfg.exComponents = NULL;
        delete this.cfg.exComponents;
        
    };
    
    ComponentMgr.prototype = {
        /**
        * 添加组件 
        * 会尝试调用组件的init方法
        * @return undefined
        * @param {String} key 组件名称 同名组件会共存
        * @param {Object | Function | Array} cpn 组件对象或构造函数，
        * @example 如果是带参数则用数组的形式：addComponent('cpnName', [cpnConstructor, arg1, arg2, arg3]);
        */
        addComponent: function(key, cpn) {
            var 
                get_type = _util.getType,
                _component;
        
            if(get_type(cpn) == 'Array') {
                try {
                    var
                        _constructor = cpn[0];
                        _args = cpn.slice(1);
                    
                    if(_args.length <= 1) {
                        _component = new _constructor(_args[0]);
                    }else {
                        var arg_trans = [];
                        for(var i=0; i<_args.length; i++) {
                            arg_trans.push('_args['+i+']');
                        }
                        arg_trans = arg_trans.join(',');
                        
                        _component = eval('new _constructor('+arg_trans+')');
                    }
                    
                }catch(ex) {}
                
            }else if(get_type(cpn) == 'Object') {
                _component = cpn;
                
            }else if(get_type(cpn) == 'Function') {
                _component = new cpn();
                
            }
            
            _component['@name'] = key;
            this.components.push({n: key, o: _component});
            
            // 为每个组件添加访问管理器的引用
            _component.cpnMgr = this;

            if(typeof _component.init == 'function') {
                _component.init(this);
            }
        },
        /**
        * 删除组件
        * @return undefined
        * @param {String} key 组件名称 会删除所有同名组件
        * 删除的时候会尝试调用 组件的destory方法 （若存在）
        */
        removeComponent: function(key) {
            var _cpn = this.components;
            var new_cpn = [];
            
            var _this = this;
            
            _util.forEach(this.components, function(item, i) {
                if(item.n === key) {
                    _this.cancelListen('all', item);
                
                    if(typeof item.o['destory'] === 'function') {
                        item.o.destory();
                    }
                }else {
                    new_cpn[new_cpn.length] = item;
                }
                
            });
            
            this.components = new_cpn;
        },
        /**
        * 把指定的组件打包到一个对象中
        * @return {undefined}
        * @param {String} key 组件名称，用空格分隔 
        * @param {Function} callback 打包的对象传入callback
        * @example
        * this.use('cpn1 cpn2', function(obj) {
            obj.cpn1.doSomething();
            obj.cpn2.doSomething();
        });
        */
        use: function(key, callback) {
            if(_util.getType(callback) !== 'Function') 
                return;
                
            var _obj = {};
                
            _util.forEach(this.components, function(cpn) {
                if(_util.strIndexOf(key, cpn.n, ' ') && !_obj[cpn.n]) {
                    _obj[cpn.n] = cpn.o;
                }
            });
            
            callback.call(this, _obj);
        },
        /**
        * 命令发送到指定组件
        * @return {Any} 返回最后一个组件的方法调用后的返回值
        * @param {String} cmd 命令名称（方法名） 
        * @param {String} key [可选] 组件名称 all 为全部组件，组件名可以用逗号分割
        */
        cmd: function(cmd, key/*arg1, arg2...*/) {
            var 
                return_value,
                _this = this,
                _args = [].slice.call(arguments, 2);
                
            _util.forEach(this.components, function(cpn) {
                if(!key || key === 'all' || _util.strIndexOf(key, cpn.n, ',')) {
                    if(typeof cpn.o[cmd] === 'function') {
                        return_value = cpn.o[cmd].apply(cpn.o, _args);
                        
                        _this.notify(cmd, cpn.o);
                    }
                }
            });

            return return_value;
        },
        /**
        * 事件监听/订阅
        * @return {Object} 为了链式操作，返回源对象 
        * @param {String} key 监听的事件名称（方法名） 
        * @param {Function} callback 回调函数
        * @param {Object} context [可选] 指定回调函数的调用对象 一般情况建议指定为组件的实例
        */
        listen: function(key, callback, context) {
            var _evt = this.events;
            if(!_evt[key]) {
                _evt[key] = [];
            }
            
            _evt[key].push({cb: callback, ctx: context});
            
            return this;
        },
        /**
        * 事件发送/分派
        * @return {undefined}
        * @param {String} key 事件名称
        */
        notify: function(key) {
            var _callbacks = this.events[key];
            
            DEBUG && console.log('event notify: %s', key, _callbacks);

            if(_callbacks) {                
                var _args = [].splice.call(arguments, 1);
                
                _util.forEach(_callbacks, function(item) {
                    var 
                        _cb = item.cb,
                        _context = item.ctx;
                        
                    _cb.apply(_context || NULL, _args);
                });
            }
        },
        /**
        * 取消事件监听
        * @return {undefined}
        * @param {String} key 事件名称
        * @param {Object} cpn [可选] 指定取消监听的组件名称
        */
        cancelListen: function(key, cpn) {
            var
                _evt = this.events,
                _callbacks = _evt[key];
            
            if(cpn && key == 'all') {
                for(var event_name in _evt) {
                    this.cancelListen(event_name, cpn);
                }
            }
            
            if(_callbacks) {
                if(cpn) {
                    var new_callbacks = [];
                
                    _util.forEach(_callbacks, function(item) {
                        if(!item.ctx || item.ctx['@name'] != cpn) {
                            new_callbacks[new_callbacks.length] = item;
                        }
                    });
                    
                    _evt[key] = new_callbacks;
                    
                }else {                    
                    _evt[key] = NULL;
                    delete _evt[key];
                }
            }
        }
    };
    
    if(typeof window.ComponentMgr == 'undefined') {
        window.ComponentMgr = ComponentMgr;
    }
    
// })();
