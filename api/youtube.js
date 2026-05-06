export default async function handler(req, res) {
  try {
    const channelId = "UCYPM1qFmrvpP2T_8GFOa0JA";


    const response = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );


    const xml = await response.text();


    const videoIdMatch = xml.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
    const videoId = videoIdMatch ? videoIdMatch[1] : "";


    return res.status(200).json({
      youtubeVideoId: videoId
    });


  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}