import {act, cleanup, render, screen} from '@testing-library/react';
import {afterEach, expect, it, vi} from 'vitest';
const state = vi.hoisted(() => ({init:vi.fn(), selected:'iForest'}));
vi.mock('../model/editor',()=>({initChart:state.init}));
vi.mock('./EditorSelector',()=>({EditorSelector:()=> <div>{state.selected}</div>}));
vi.mock('./EditorForm',()=>({EditorForm:()=>null}));
vi.mock('./EditorTree',()=>({EditorTree:()=>null}));
vi.mock('./EditorPreview',()=>({EditorPreview:()=>null}));
vi.mock('./DSLDataViewer',()=>({DSLDataViewer:()=>null}));
vi.mock('./EditorAIController',()=>({EditorAIController:()=>null}));
import {Editor} from './Editor';
afterEach(()=>{cleanup();vi.clearAllMocks();state.selected='iForest';});
it('does not show the default chart while restoring a saved selection',async()=>{
 let finish!:()=>void;
 state.init.mockImplementation(()=>new Promise<void>(resolve=>{finish=()=>{state.selected='OpinionSeer';resolve();};}));
 render(<Editor/>);
 expect(screen.getByRole('status').textContent).toContain('Loading');
 expect(screen.queryByText('iForest')).toBeNull();
 await act(async()=>finish());
 expect(screen.getByText('OpinionSeer')).toBeTruthy();
 expect(screen.queryByRole('status')).toBeNull();
});
it('shows initialization failure instead of displaying an unrelated default chart',async()=>{
 state.init.mockRejectedValue(new Error('No available DSL data source could be loaded.'));
 await act(async()=>{render(<Editor/>);});
 expect(screen.getByRole('alert').textContent).toContain('No available DSL');
 expect(screen.queryByText('iForest')).toBeNull();
});
