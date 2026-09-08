export interface FontStyleOption {
  id: string;
  label: string;
  category: "Default" | "Sans-Serif" | "Serif" | "Display" | "Monospace";
  regularUrl?: string;
  boldUrl?: string;
}

export const fontStyles: FontStyleOption[] = [
  { id: "Default", label: "Default System", category: "Default" },
  {
    id: "Inter",
    label: "Inter",
    category: "Sans-Serif",
    regularUrl: "https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfMZhrib2Bg-4.ttf",
    boldUrl: "https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf",
  },
  {
    id: "Roboto",
    label: "Roboto",
    category: "Sans-Serif",
    regularUrl: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.ttf",
    boldUrl: "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1Mu4mxKKTU1Kvnz.ttf",
  },
  {
    id: "Open Sans",
    label: "Open Sans",
    category: "Sans-Serif",
    regularUrl: "https://fonts.gstatic.com/s/opensans/v34/memvYaGs126MiZpBA-UvWbX2vVnXBGeHO1ZFUDhyu6qYSMOB.ttf",
    boldUrl: "https://fonts.gstatic.com/s/opensans/v34/memvYaGs126MiZpBA-UvWbX2vVnXBGeHO1ZFUDhyu6qYSMOB.ttf",
  },
  {
    id: "Poppins",
    label: "Poppins",
    category: "Sans-Serif",
    regularUrl: "https://fonts.gstatic.com/s/poppins/v20/pxiEyp8kv8JHgFVrFJLMuc7F.ttf",
    boldUrl: "https://fonts.gstatic.com/s/poppins/v20/pxiByp8kv8JHgFVrLCz7Z11lFd2JQEl8qw.ttf",
  },
  {
    id: "Nunito",
    label: "Nunito",
    category: "Sans-Serif",
    regularUrl: "https://fonts.gstatic.com/s/nunito/v25/XRXX3I-yRUUNftZB305dtg.ttf",
    boldUrl: "https://fonts.gstatic.com/s/nunito/v25/XRXX3I-yRUUNftZB305dtg.ttf",
  },
  {
    id: "Lato",
    label: "Lato",
    category: "Sans-Serif",
    regularUrl: "https://fonts.gstatic.com/s/lato/v24/S6uyw4X52PVlnyLx.ttf",
    boldUrl: "https://fonts.gstatic.com/s/lato/v24/S6u9w4X52PVlndZwjEw.ttf",
  },
  {
    id: "Montserrat",
    label: "Montserrat",
    category: "Display",
    regularUrl: "https://fonts.gstatic.com/s/montserrat/v25/JTUSjIg1_i6t8kCHKm459WRhyzAL.ttf",
    boldUrl: "https://fonts.gstatic.com/s/montserrat/v25/JTURjIg1_i6t8kCHKm45_dJE330AZVY.ttf",
  },
  {
    id: "Merriweather",
    label: "Merriweather",
    category: "Serif",
    regularUrl: "https://fonts.gstatic.com/s/merriweather/v30/u-440qyriQwlOrhSvowK_l5-fCZM.ttf",
    boldUrl: "https://fonts.gstatic.com/s/merriweather/v30/u-4n0qyriQwlOrhSvowK_l52xwNZWMf6.ttf",
  },
  {
    id: "Oswald",
    label: "Oswald",
    category: "Display",
    regularUrl: "https://fonts.gstatic.com/s/oswald/v49/TK3iWkUHHAIjg752GT8G.ttf",
    boldUrl: "https://fonts.gstatic.com/s/oswald/v49/TK3iWkUHHAIjg752HT8G.ttf",
  },
];
