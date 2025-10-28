import { updateData, getData } from '../database/bddFunction.js';

async function decompte(channel_id) {
    try{
        let sapper = await getData('sapper');
        let channel = sapper.find(u=>u.channel_id === channel_id);
        let mines = channel?.mine_nb;
        if(mines >0){
            let probability = mines;
            let randomInt = Math.floor(Math.random()*100);
            if(randomInt < probability){
                await updateData('sapper', {mine_nb : mines-1}, {channel_id : channel_id});
                return true;
            }
        }
        return false;
    }catch (error){
        console.error(`Erreur dans sapperGame.js:`, error);
        return false;
    }
    
}

export default decompte ;