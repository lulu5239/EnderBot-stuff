const fs = require("fs")
const PImage = require("pureimage") // Needs to be installed
const https = require("https")
var tempDatas = {EnderBotSummonInfos:{}}
var logger = {
  summonCheckTimings: false,
}

var datas = {}
datas.EnderBotCards = []
setTimeout(()=>{ // Loading cards...
  // This is a complex script to save up RAM, but this shorter alternative should also work:
  // datas.EnderBotCards = fs.readFileSync("./EBcards.json","utf8").split("\n").map(l=>JSON.parse(l))
  let p = new Promise((ok,err)=>{
    let stream = fs.createReadStream("./EBcards.json", {encoding:"utf8"}) // Downloadable at: https://github.com/lulu5239/EnderBot-stuff/releases/tag/v1.1
    let reste = ""; let crash = false
    stream.on("data",chunk=>{if(crash){return}
      reste+=chunk
      let l = reste.split("\n")
      l.slice(0,-1).forEach(l=>{
        try{
          datas.EnderBotCards.push(JSON.parse(l))
        }catch(e){crash=true;err(e);throw ""}
      })
      reste=l.slice(-1)[0]
    })
    stream.on("end",()=>{if(crash){return}
      try{
        datas.EnderBotCards.push(JSON.parse(reste))
      }catch(e){return err(e)}
      ok()
    })
  })
  p.catch(e=>{
    console.error("Error loading EnderBot cards...")
    console.error(e)
  })
},0)

/* The structure of each card:
 - nom: the character name;
 - source: the anime source;
 - stars: the number of stars;
 - img: a MyAnimeList URL to the character's image;
 - imgSource: set in case the image got deleted;
 - pixels: an array of saves of the character's image as seen on summons;
 - pixelsNom: an array of saves of the text under the character on summons.
*/

var saveCards = async ()=>{ // Also complex script for saving, simpler alternative:
  // fs.writeFileSync("./EBcards.json",datas.EnderBotCards.map(l=>JSON.stringify(l)).join("\n"))
  let stream = fs.createWriteStream("./EBcards.json",{encoding:"utf8"})
  for(let i = 0; i<datas.EnderBotCards.length; i+=5){
    stream.write(datas.EnderBotCards.slice(i,i+5).map(l=>JSON.stringify(l)).join("\n")+(i+5<datas.EnderBotCards.length ? "\n" : ""))
  }
  stream.end()
}

// To display cards in embeds.
// n: number in the cards list
// prise: if the card has been taken
var embedEnderBotCard = (n,prise)=>{
  let c = datas.EnderBotCards[n]
  return (c?.stars || c?.name) ? {
    title:c.name || "(No name)",
    description:(c.stars || "❔️")+" ⭐️"+(c.source ? ", from "+c.source : ""),
    footer:{text:"#"+n},
    thumbnail:c.img?.startsWith("https://cdn.myanimelist.net/") && c.imgSource!=="save" && {url:c.imgSource==="EnderBotPNG" ? "https://api.ender.gg/cdn/"+Buffer.from(c.img).toString("base64")+".png" : c.imgSource==="EnderBot" ? "https://api.ender.gg/cdn/"+Buffer.from(c.img).toString("base64") : c.img} || {url:"https://enderbot.lublox.tk/restore-card/"+n},
    color:prise ? 0x333333 : !c.stars ? 0x000001 : c.stars==1 ? 0x005500 : c.stars==2 ? 0x00AA00 : c.stars==3 ? 0x00FF00 : c.stars==4 ? 0x00DDDD : c.stars==5 ? 0xFF00FF : c.stars==6 ? 0xDD2244 : c.stars==7 ? 0xFF8800 : null,
  } : {
    title:"No data...",
    footer:{text:n!==-1 ? "#"+n : "Unknown card."},
    color:0x774400,
    thumbnail:{url:"https://enderbot.lublox.tk/restore-card/"+n+"?"+Math.random()}, // Edit if you have a similar website I guess.
  }
}

// Weird function, maybe useful with bitmaps.
var getPixelPos = (width,x,y,z)=>{
  return (x+y*width)*4+z
}

// For finding which cards are on the summon.
// url: the URL to the summon
// noNew: use to make the summon not change data, if the summon doesn't directly come from EnderBot for example
// toMessage: to convert the result into a message
var checkEnderBotSummon = async (url,noNew,toMessage)=>{
  let cards; const dt = new Date().getTime()
  if(tempDatas.EnderBotSummonInfos[url]===null){ // if currently fetching/processing
    let t = 0
    let ok;let err;let p = new Promise((ok2,err2)=>{ok = ok2;err = err2})
    let f;f = async ()=>{t++
      if(tempDatas.EnderBotSummonInfos[url]){
        ok(tempDatas.EnderBotSummonInfos[url])
      }else if(t>60){
        tempDatas.EnderBotSummonInfos[url] = undefined
        //ok(await checkEnderBotSummon(url,noNew,toMessage))
        return err("Image fetching was too slow.")
      }else{
        setTimeout(f,1000)
      }
    }
    f()
    return await p
  }else if(tempDatas.EnderBotSummonInfos[url]){
    cards = tempDatas.EnderBotSummonInfos[url]
  }else{
    tempDatas.EnderBotSummonInfos[url] = null
  }
  if(cards && cards.includes(null) && !noNew){cards = null} // Not using cache when there was an unknown card
  let img1; let ctx
  if(!cards){ // If not cached, fetching summon...
    let p = new Promise((ok,errer)=>{
      https.get(url
      	,stream=>{
      	  PImage.decodePNGFromStream(stream).then(ok).catch(e=>{
         delete tempDatas.EnderBotSummonInfos[url]
         errer("Couldn't fetch image.")
       })
      	})
    	})
    img1 = await p.catch(e=>{
      throw e
    })
    if(!img1){return}
    ctx = img1.getContext("2d")
    if(ctx.bitmap.width !== 877 && ctx.bitmap.height!== 682){
      delete tempDatas.EnderBotSummonInfos[url]
      throw "Wrong image size."
    }
  }
  if(!cards){
   let finir
   let finiP = new Promise(ok=>{finir = ok})
   cards = [undefined,undefined,undefined];
   ([0,1,2]).forEach(async pos=>{
    let r1 = "" // Taking particular pixels from the imagr
    let plus = 5+Math.floor(pos*292.5)
    let y = 0
    while(y<425){
      let x = 0
      while(x<275){
        let p = getPixelPos(ctx.bitmap.width,x+plus,y+5,0)
        r1+=
        Math.floor(ctx.bitmap.data[p+0]/8).toString(32)+
        Math.floor(ctx.bitmap.data[p+1]/8).toString(32)+
        Math.floor(ctx.bitmap.data[p+2]/8).toString(32)
      x+=10}
    y+=10}
    
    let l1 = r1.split("")
    let matchs = [] // Comparing with saved cards
    datas.EnderBotCards.forEach(c=>{
      c.pixels.forEach(pixels=>{
        let ok = 0
        pixels.split("").forEach((p,i)=>{if(p===l1[i]){ok++}})
        let m = ok/l1.length
        if(m >= 0.4){matchs.push({m,c})}
      })
    })
    let carte = matchs.length && matchs.sort((m1,m2)=>m2.m-m1.m)[0].c // Choosing the card with the most similar pixels
    
    let r2 = "" // Taking text pixels (unused)
    plus = 2+Math.floor(pos*292.5)
    y = 464
    while(y<510){
      let x = 0
      while(x<290){
        let p = getPixelPos(ctx.bitmap.width,x+plus,y+5,0)
        r2+= ctx.bitmap.data[p+0]>230 ? "1" : "0"
        x+=1}
      y+=1}
    
    let l2 = r2.split("")
    let carte2 /*= datas.EnderBotCards.find(c=>{
      return c.pixelsNom?.find(pixels=>{
        let ok = 0; let sur = 0
        pixels.split("").forEach((p,i)=>{if(p==="1"){sur++;if(l1[i]==="1"){ok++}}})
        //console.log("Matching percent:",ok/sur,ok,sur)
        return ok >= l1.length*0.4
      })
    })*/
    let b32 = ""
    for(let i=0; i<r2.length; i+=5){
      b32 += parseInt(r2.substr(i,5),2).toString(32)
    }
    r2 = b32
    if(carte){ // Storing, if needed for later
      if(!carte.pixelsNom){carte.pixelsNom = []}
      if(!carte.pixelsNom.includes(r2)){
        carte.pixelsNom.push(r2)
      }
      if(!noNew && !carte.img){carte.img=url+"?pos"+pos}
    }else if(!carte && carte2){
      carte = carte2
    }
    if(!carte && !noNew){ // Found new card?
      carte = {pixels:[r1],img:url+"?pos"+pos,pixelsNom:[r2]}
      datas.EnderBotCards.push(carte)
    }else if(!carte){carte = null}
    cards[pos] = carte
    if(!cards.includes(undefined)){finir()}
   })
   await finiP
  }
  tempDatas.EnderBotSummonInfos[url] = cards
  if(cards.includes(null)){ // Maybe send summon when there is an unknown card.
    client.channels.cache.get("")?.send(url)
  }
  if(ctx){ // Insert into the array an array indicating which cards were claimed.
   cards.unshift(([0,1,2]).map(p=>{
    for(let i = 292*p; i<292*(p+1); i++){
      let n = getPixelPos(ctx.bitmap.width,i,550,0)
      if(!(ctx.bitmap.data[n]<=30 && ctx.bitmap.data[n+1]<=36 && ctx.bitmap.data[n+2]<=52)){return true}
    }
    return false
   }))
  }
  if(logger.summonCheckTimings){console.log("🕑 Summon check timing:",new Date().getTime() - dt,"ms")}
  if(toMessage){
    return {embeds:cards.slice(1).map((c,ci)=>{
        let n = datas.EnderBotCards.findIndex(c2=>c2===c)
        return embedEnderBotCard(n,cards[0][ci])
      }),components:cards.slice(1).filter(c=>c).length && (toMessage.user || toMessage.author)?.id==="" /* your user ID */ && [new ActionRowBuilder().addComponents(cards.slice(1).filter(c=>c).map(c=>{
        let n = datas.EnderBotCards.findIndex(c2=>c2===c)
        if(n===-1){n=Math.random()}
        return new ButtonBuilder().setLabel("Edit card #"+n).setCustomId("ebeditcard"+n).setStyle(c?.stars && ButtonStyle.Primary || ButtonStyle.Danger).setDisabled(!c)
      }))] || undefined}
  }else{return cards}
}

setTimeout(()=>{return // For testing?
  checkEnderBotSummon("https://media.discordapp.net/attachments/310516646257360907/1173395767977844736/ebdrop.png?ex=6563ccf7&is=655157f7&hm=e893d618e6fd6ce048867aae95e0ea32441d2f1ce309a55d8fde66d4b1f3413a&",false,true).then(console.log)
},5000)