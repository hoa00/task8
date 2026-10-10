import {createContext,useContext} from 'react';
// Project identity only; server data remains in Query's workspace bootstrap/cache.
export const ProjectContext=createContext<string|null>(null);
export function useProjectId():string {const id=useContext(ProjectContext);if(!id)throw Error('Project feature requires the project layout');return id;}
