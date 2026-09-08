import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({apply:vi.fn(),state:{
 dsl_data:{'0':[{x1:1,y1:2}]}, dsl_container:{'0':{template_id:'0'}},
 selectedContainerId:'0',selectedContainer:{if_leaf:true},selectedContainerChildren:[{container_id:'0'}],
 currentDataFormProp:'all',isSaving:false,chart:{dsl_cache:{}}
}}));
vi.mock('../model/editor',()=>{
 const store=(selector:any)=>selector(mocks.state);store.getState=()=>mocks.state;store.setState=vi.fn();
 return {useChartStore:store,applyDataChanges:mocks.apply};
});
import {DSLDataViewer} from './DSLDataViewer';
import {DataFormProp} from '../type';
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('shows a rejected data edit and keeps its draft available for correction',async()=>{
 mocks.state.currentDataFormProp=DataFormProp.ALL;
 mocks.apply.mockRejectedValue(new Error('Shared fields must be edited through data_sources.'));
 render(<DSLDataViewer/>);
 const text=screen.getByRole('textbox',{name:'Container data JSON'});
 fireEvent.change(text,{target:{value:'{"0":[{"x1":9,"y1":2}]}'}});
 fireEvent.click(screen.getByRole('button',{name:'Apply Changes'}));
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('Shared fields'));
 expect(text).toHaveValue('{"0":[{"x1":9,"y1":2}]}');
 expect(screen.getByRole('button',{name:'Apply Changes'})).toBeEnabled();
});
