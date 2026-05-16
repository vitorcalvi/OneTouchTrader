import React from 'react';
import { NewsFeed } from '../feed/NewsFeed';
import { NewsFilterBar } from '../feed/NewsFilterBar';
import { NewsReader } from '../reader/NewsReader';

export const NewsPanel: React.FC = () => {
  return (
    <div className="flex flex-col w-full" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
      <div className="mb-4 shrink-0">
        <NewsFilterBar />
      </div>
      
      <div className="flex-1 flex gap-4 min-h-0">
        <div className="w-[40%] min-w-[300px] max-w-[400px] flex flex-col bg-base rounded-xl border border-slate-800 overflow-hidden">
          <div className="flex-1 p-3 overflow-hidden">
            <NewsFeed />
          </div>
        </div>
        
        <div className="flex-1 bg-surface rounded-xl border border-slate-800 overflow-hidden">
          <NewsReader />
        </div>
      </div>
    </div>
  );
};

export default NewsPanel;
