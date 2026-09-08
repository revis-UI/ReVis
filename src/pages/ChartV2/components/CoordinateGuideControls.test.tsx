import {render,screen,fireEvent,waitFor,act} from '@testing-library/react';
import {describe,it,expect,vi,beforeEach} from 'vitest';
vi.mock('../model/editor',async()=>{
 const {create}=await import('zustand');
 const useChartStore=create<any>(()=>({}));
 return {useChartStore,changeCoordinateGuides:vi.fn(async(guides:any)=>{
  useChartStore.setState({dsl_json:{...useChartStore.getState().dsl_json,coordinate_guides:guides}});
 })};
});
import {useChartStore,changeCoordinateGuides} from '../model/editor';
import {CoordinateGuideControls} from './CoordinateGuideControls';
const c=(id:string,coordinate='cartesian')=>({container_id:id,coordinate});
beforeEach(()=>{
 vi.clearAllMocks();
 useChartStore.setState({chart:{dsl_container:{'0':c('0'),'0-a':c('0-a'),'0-1a':c('0-1a'),'0-p':c('0-p','polar')}},dsl_json:{},isSaving:false,selectedContainerId:null,dsl_file:'case'} as any,true);
});
describe('coordinate guide selection',()=>{
 it('shows selected child axes and turns off the implicit root',async()=>{
  render(<CoordinateGuideControls/>);
  fireEvent.change(screen.getByLabelText('Coordinate guide container'),{target:{value:'0-1a'}});
  await waitFor(()=>expect(screen.getByLabelText('Show coordinate system')).toBeChecked());
  await waitFor(()=>expect(screen.getByLabelText('Coordinate guide container')).toHaveValue('0-1a'));
  const guides=useChartStore.getState().dsl_json!.coordinate_guides as any;
  expect(guides['0'].visible).toBe(false);expect(guides['0-1a']).toMatchObject({visible:true,x:true,y:true});
  fireEvent.click(screen.getByLabelText('Show coordinate system'));
  await waitFor(()=>expect(screen.getByLabelText('Show coordinate system')).not.toBeChecked());
 });
 it('follows editor tree selection, preserves explicit guides, and does not undo manual hiding',async()=>{
  useChartStore.setState({dsl_json:{coordinate_guides:{'0':{visible:true}}}} as any);
  render(<CoordinateGuideControls/>);
  act(()=>useChartStore.setState({selectedContainerId:'0-p'}));
  await waitFor(()=>expect(screen.getByLabelText('Coordinate guide container')).toHaveValue('0-p'));
  expect(screen.getByLabelText('radius axis')).toBeChecked();
  expect((useChartStore.getState().dsl_json!.coordinate_guides as any)['0'].visible).toBe(true);
  fireEvent.click(screen.getByLabelText('Show coordinate system'));
  await waitFor(()=>expect(screen.getByLabelText('Show coordinate system')).not.toBeChecked());
  expect(changeCoordinateGuides).toHaveBeenCalledTimes(2);
 });
 it('reports save failure without pretending to select another system',async()=>{
  vi.mocked(changeCoordinateGuides).mockRejectedValueOnce(new Error('save failed'));
  render(<CoordinateGuideControls/>);
  fireEvent.change(screen.getByLabelText('Coordinate guide container'),{target:{value:'0-a'}});
  await screen.findByRole('alert');expect(screen.getByRole('alert')).toHaveTextContent('save failed');
  expect(screen.getByLabelText('Coordinate guide container')).toHaveValue('0');
 });
});
