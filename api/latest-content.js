export default async function handler(req, res) {
  try {
    const channelHandle = "jesiennes";


    const response = await fetch(`https://www.youtube.com/@${channelHandle}/shorts`);
    const html = await response.text();


    const match = html.match(/"videoId":"([^"]+)"/);
    const latestShortsId = match ? match[1] : "guJcyQG44pE";


    return res.status(200).json({
      tiktokUrl: "https://www.tiktok.com/@bigjesi/video/EXEMPLO",
      instagramBigJesiUrl: "",
      instagramBbsLabUrl: "",
      youtubeVideoId: latestShortsId
    });
  } catch (error) {
    return res.status(200).json({
      tiktokUrl: "https://www.tiktok.com/@bigjesi/video/EXEMPLO",
      instagramBigJesiUrl: "",
      instagramBbsLabUrl: "",
      youtubeVideoId: "guJcyQG44pE"
    });
  }
}