export default async function handler(req, res) {
  try {
    const channelId = "SEU_CHANNEL_ID";


    const response = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );


    const xml = await response.text();


    const videoId = xml.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1];


    res.status(200).json({
      youtubeVideoId: videoId || ""
    });


  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}